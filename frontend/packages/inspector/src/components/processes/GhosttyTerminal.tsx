import { AlertCircle, Loader2, PlugZap, SquareTerminal } from "lucide-react";
import { FitAddon, Terminal, init } from "ghostty-web";
import { useEffect, useRef, useState } from "react";
import type { ProcessTerminalServerFrame, SandboxAgent } from "sandbox-agent";

type ConnectionState = "connecting" | "ready" | "closed" | "error";

const terminalTheme = {
  background: "#09090b",
  foreground: "#f4f4f5",
  cursor: "#f97316",
  cursorAccent: "#09090b",
  selectionBackground: "#27272a",
  black: "#18181b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#f472b6",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#3f3f46",
  brightRed: "#fb7185",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#f9a8d4",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

const toUint8Array = async (data: Blob | ArrayBuffer): Promise<Uint8Array> => {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(await data.arrayBuffer());
};

const isServerFrame = (value: unknown): value is ProcessTerminalServerFrame => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return type === "ready" || type === "exit" || type === "error";
};

const GhosttyTerminal = ({
  client,
  processId,
  onExit,
}: {
  client: SandboxAgent;
  processId: string;
  onExit?: () => void;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting to PTY...");
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let socket: WebSocket | null = null;
    let resizeRaf = 0;
    let removeDataListener: { dispose(): void } | null = null;
    let removeResizeListener: { dispose(): void } | null = null;

    const sendFrame = (payload: unknown) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(payload));
    };

    const syncSize = () => {
      if (!terminal) {
        return;
      }
      sendFrame({
        type: "resize",
        cols: terminal.cols,
        rows: terminal.rows,
      });
    };

    const connect = async () => {
      try {
        await init();
        if (cancelled || !hostRef.current) {
          return;
        }

        terminal = new Terminal({
          allowTransparency: true,
          cursorBlink: true,
          cursorStyle: "block",
          fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace",
          fontSize: 13,
          smoothScrollDuration: 90,
          theme: terminalTheme,
        });
        fitAddon = new FitAddon();

        terminal.open(hostRef.current);
        terminal.loadAddon(fitAddon);
        fitAddon.fit();
        fitAddon.observeResize();
        terminal.focus();

        removeDataListener = terminal.onData((data) => {
          sendFrame({ type: "input", data });
        });

        removeResizeListener = terminal.onResize(() => {
          if (resizeRaf) {
            window.cancelAnimationFrame(resizeRaf);
          }
          resizeRaf = window.requestAnimationFrame(syncSize);
        });

        const nextSocket = client.connectProcessTerminalWebSocket(processId);
        socket = nextSocket;
        nextSocket.binaryType = "arraybuffer";

        const tryParseControlFrame = (raw: string | ArrayBuffer | Blob): ProcessTerminalServerFrame | null => {
          let text: string | undefined;
          if (typeof raw === "string") {
            text = raw;
          } else if (raw instanceof ArrayBuffer) {
            // Server may send JSON control frames as binary; try to decode small messages as JSON.
            if (raw.byteLength < 256) {
              try {
                text = new TextDecoder().decode(raw);
              } catch {
                // not decodable, treat as terminal data
              }
            }
          }
          if (!text) return null;
          try {
            const parsed = JSON.parse(text);
            return isServerFrame(parsed) ? parsed : null;
          } catch {
            return null;
          }
        };

        const handleControlFrame = (frame: ProcessTerminalServerFrame): void => {
          if (frame.type === "ready") {
            setConnectionState("ready");
            setStatusMessage("Connected");
            syncSize();
            return;
          }
          if (frame.type === "exit") {
            setConnectionState("closed");
            setExitCode(frame.exitCode ?? null);
            setStatusMessage(
              frame.exitCode == null ? "Process exited." : `Process exited with code ${frame.exitCode}.`
            );
            onExit?.();
            return;
          }
          if (frame.type === "error") {
            setConnectionState("error");
            setStatusMessage(frame.message);
          }
        };

        nextSocket.addEventListener("message", (event) => {
          if (cancelled || !terminal) {
            return;
          }

          const controlFrame = tryParseControlFrame(event.data);
          if (controlFrame) {
            handleControlFrame(controlFrame);
            return;
          }

          void toUint8Array(event.data).then((bytes) => {
            if (!cancelled && terminal) {
              terminal.write(bytes);
            }
          });
        });

        nextSocket.addEventListener("close", () => {
          if (cancelled) {
            return;
          }
          setConnectionState((current) => (current === "error" ? current : "closed"));
          setStatusMessage((current) => (current === "Connected" ? "Terminal disconnected." : current));
        });

        nextSocket.addEventListener("error", () => {
          if (cancelled) {
            return;
          }
          setConnectionState("error");
          setStatusMessage("WebSocket connection failed.");
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setConnectionState("error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to initialize Ghostty terminal.");
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (resizeRaf) {
        window.cancelAnimationFrame(resizeRaf);
      }
      removeDataListener?.dispose();
      removeResizeListener?.dispose();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "close" }));
        socket.close();
      } else if (socket?.readyState === WebSocket.CONNECTING) {
        const pendingSocket = socket;
        pendingSocket.addEventListener("open", () => {
          pendingSocket.close();
        }, { once: true });
      }
      terminal?.dispose();
    };
  }, [client, onExit, processId]);

  return (
    <div className="process-terminal-shell">
      <div className="process-terminal-meta">
        <div className="inline-row">
          <SquareTerminal size={13} />
          <span>Ghostty PTY</span>
        </div>
        <div className={`process-terminal-status ${connectionState}`}>
          {connectionState === "connecting" ? <Loader2 size={12} className="spinner-icon" /> : null}
          {connectionState === "ready" ? <PlugZap size={12} /> : null}
          {connectionState === "error" ? <AlertCircle size={12} /> : null}
          <span>{statusMessage}</span>
          {exitCode != null ? <span className="mono">exit={exitCode}</span> : null}
        </div>
      </div>
      <div
        ref={hostRef}
        className="process-terminal-host"
        role="presentation"
        onClick={() => {
          hostRef.current?.querySelector("textarea")?.focus();
        }}
      />
    </div>
  );
};

export default GhosttyTerminal;
