import { BaseMessage } from "./base-message";

export class UnknownMessage extends BaseMessage {
	rawData: Uint8Array | null;
	errorDesc: string | null;
	code: number | null;

	constructor(rawData: Uint8Array | null = null, errorDesc: string | null = null, code: number | null = null) {
		super();
		this.rawData = rawData;
		this.errorDesc = errorDesc;
		this.code = code;
	}

	toPlainObject(): any {
		return {
			error: this.errorDesc,
			rawData: this.rawData ? Array.from(this.rawData) : null,
			code: this.code
		};
	}

	fromPlainObject(_obj: any): void {}
}
