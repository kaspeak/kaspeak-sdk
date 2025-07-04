import { MessageHeader } from "../message-header";

export abstract class BaseMessage {
	static requiresEncryption: boolean = false;
	static messageType: number = -1;
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

	abstract toPlainObject(): any;

	abstract fromPlainObject(obj: any): void;
}
