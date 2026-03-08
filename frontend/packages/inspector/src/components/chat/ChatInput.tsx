import { Send } from "lucide-react";
import { useEffect, useRef } from "react";

const ChatInput = ({
  message,
  onMessageChange,
  onSendMessage,
  onKeyDown,
  placeholder,
  disabled
}: {
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  disabled: boolean;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const styles = window.getComputedStyle(textarea);
    const parsedMaxHeight = Number.parseFloat(styles.maxHeight);
    const maxHeight = Number.isFinite(parsedMaxHeight) ? parsedMaxHeight : 200;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, 22)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message]);

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
        />
        <button className="send-button" onClick={onSendMessage} disabled={disabled || !message.trim()}>
          <Send />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
