/// <reference path="../FB3ReaderHeaders.ts" />

module FB3Bookmarks {

	export interface InnerFB2 extends String {}
	export interface IXpath extends String { };

	export interface IBookmarksReadyCallback { (Bookmarks: IBookmarks): void; }

	export interface IBookmark {
		ID: string;
		Range: FB3DOM.IRange;
		XStart: IXpath;
		XEnd: IXpath;
		Group: number;
		Class: string;
		Title: string;
		Note: InnerFB2;
		Extract: InnerFB2;
	}

	export interface IBookmarks {
		Ready: boolean;
		FB3DOM: FB3DOM.IFB3DOM;
		Reader: FB3Reader.IFBReader;
		Bookmarks: IBookmark[];
		CurPos: IBookmark;
		Load(ArtID: string, Callback?: IBookmarksReadyCallback);
		Store(): void;
	}

}