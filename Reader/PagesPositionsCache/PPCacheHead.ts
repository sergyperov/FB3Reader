/// <reference path="../../FB3ReaderHeaders.ts" />
/// <reference path="../FB3ReaderHead.ts" />

module FB3PPCache {
	export interface IFB3PPCache {
		Set(I: number, Instr: FB3Reader.IPageRenderInstruction): void;
		Get(I: number): FB3Reader.IPageRenderInstruction;
		Save(Key: string): void;
		Load(Key: string): void;
		Reset(): void;
		Length(): number;
	}

}