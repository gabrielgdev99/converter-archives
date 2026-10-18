export class ConvertError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ConvertError';
    this.code = options.code || 'CONVERT';
  }
}

export class Cancelled extends Error {
  constructor() {
    super('Conversão cancelada.');
    this.name = 'Cancelled';
    this.code = 'CANCELLED';
  }
}
