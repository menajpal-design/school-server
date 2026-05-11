declare module 'nodemailer' {
  interface Attachment {
    filename?: string;
    content?: Buffer;
    path?: string;
  }

  interface SendMailOptions {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Attachment[];
  }

  interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
  }

  interface TransportOptions {
    sendmail?: boolean;
    [key: string]: unknown;
  }

  function createTransport(options: TransportOptions): Transporter;

  export { createTransport };
  const nodemailer: {
    createTransport: typeof createTransport;
  };
  export default nodemailer;
}
