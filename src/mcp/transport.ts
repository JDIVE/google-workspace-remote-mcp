export class SSETransport {
  private encoder = new TextEncoder();
  private stream: TransformStream<Uint8Array, Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor() {
    this.stream = new TransformStream();
    this.writer = this.stream.writable.getWriter();
  }

  async send(data: any): Promise<void> {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    await this.writer.write(this.encoder.encode(message));
  }

  async sendError(error: any): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      error: {
        code: error.code || -32603,
        message: error.message || "Internal error",
        data: error.data,
      },
    });
  }

  async close(): Promise<void> {
    await this.writer.close();
  }

  getResponse(headers: Record<string, string> = {}): Response {
    return new Response(this.stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...headers,
      },
    });
  }
}
