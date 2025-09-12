import { MessageHeader } from "../message-header";
import type { SignatureType } from "../../sdk/types";

export abstract class BaseMessage {
	static requiresEncryption: boolean = false;
	static messageType: number = -1;
	static signatureType: SignatureType = "single";
	header?: MessageHeader;

	protected constructor(header?: MessageHeader) {
		this.header = header;
	}

	get requiresEncryption(): boolean {
		return (this.constructor as typeof BaseMessage).requiresEncryption;
	}

	get messageType(): number {
		return (this.constructor as typeof BaseMessage).messageType;
	}

	get signatureType(): SignatureType {
		return (this.constructor as typeof BaseMessage).signatureType;
	}

	abstract toPlainObject(): any;

	abstract fromPlainObject(obj: any): void;
}
