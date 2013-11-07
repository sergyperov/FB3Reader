﻿/// <reference path="FB3ReaderHead.ts" />
/// <reference path="FB3ReaderPage.ts" />
var FB3Reader;
(function (FB3Reader) {
    //	interface IDumbCallback { () }
    function PosCompare(Pos1, Pos2) {
        var Result = 0;
        for (var I = 0; I < Math.min(Pos1.length, Pos2.length); I++) {
            if (Pos1[I] != Pos2[I]) {
                Result = Pos1[I] * 1 > Pos2[I] * 1 ? 1 : -1;
                break;
            }
        }

        if (Result == 0 && Pos1.length != Pos2.length) {
            Result = Pos1.length > Pos2.length ? 1 : -1;
        }

        return Result;
    }

    function RangeClone(BaseRange) {
        return {
            From: BaseRange.From.slice(0),
            To: BaseRange.To.slice(0)
        };
    }
    FB3Reader.RangeClone = RangeClone;

    function PRIClone(Range) {
        return {
            Range: RangeClone(Range.Range),
            CacheAs: Range.CacheAs,
            Height: Range.Height,
            NotesHeight: Range.NotesHeight
        };
    }

    var Reader = (function () {
        function Reader(ArtID, EnableBackgroundPreRender, Site, FB3DOM, Bookmarks, PagesPositionsCache) {
            this.ArtID = ArtID;
            this.EnableBackgroundPreRender = EnableBackgroundPreRender;
            this.Site = Site;
            this.FB3DOM = FB3DOM;
            this.Bookmarks = Bookmarks;
            this.PagesPositionsCache = PagesPositionsCache;
            // Basic class init
            this.HyphON = true;
            this.NColumns = 2;
            this.CacheForward = 6;
            this.CacheBackward = 2;

            //				this.CurStartPos = [495,0];
            this.CurStartPos = [0];

            this.IdleOff();
        }
        Reader.prototype.Init = function () {
            var _this = this;
            this.PrepareCanvas();
            this.FB3DOM.Init(this.HyphON, this.ArtID, function () {
                _this.LoadDone(1);
            });
            this.Bookmarks.FB3DOM = this.FB3DOM;
            this.Bookmarks.Reader = this;
            this.Bookmarks.Load(this.ArtID, function () {
                _this.LoadDone(2);
            });
        };

        Reader.prototype.LoadDone = function (a) {
            //			console.log('LoadDone ' + a + '/' + this.FB3DOM.Ready + ':' + this.Bookmarks.Ready);
            var ReadPos;
            if (this.FB3DOM.Ready && this.Bookmarks.Ready) {
                if (this.Bookmarks && this.Bookmarks.CurPos) {
                    ReadPos = this.Bookmarks.CurPos.Range.From.slice(0);
                } else {
                    ReadPos = this.CurStartPos.slice(0);
                }
                this.GoTO(ReadPos);
            }
        };

        Reader.prototype.GoTO = function (NewPos) {
            clearTimeout(this.MoveTimeoutID);
            this.IdleOff();

            //			console.log('GoTO ' + NewPos);
            this.CurStartPos = NewPos.slice(0);
            var GotoPage = this.GetCachedPage(NewPos);
            if (GotoPage != undefined) {
                this.GoTOPage(GotoPage);
            } else {
                this.GoToOpenPosition(NewPos);
            }
        };
        Reader.prototype.GoTOPage = function (Page) {
            if (this.PagesPositionsCache.LastPage() && Page > this.PagesPositionsCache.LastPage()) {
                this.Site.NotePopup('Paging beyong the file end');
                return;
            }

            // Wow, we know the page. It'll be fast. Page is in fact a column, so it belongs to it's
            // set, NColumns per one. Let's see what start column we are going to deal with
            clearTimeout(this.MoveTimeoutID);
            var RealStartPage = Math.floor(Page / this.NColumns) * this.NColumns;

            var FirstPageNToRender;
            var FirstFrameToFill;
            var WeeHaveFoundReadyPage = false;

            for (var I = 0; I < this.Pages.length / this.NColumns; I++) {
                var BasePage = I * this.NColumns;

                if (this.Pages[BasePage].Ready && this.Pages[BasePage].PageN == RealStartPage) {
                    this.PutBlockIntoView(BasePage);
                    WeeHaveFoundReadyPage = true;

                    // Ok, now we at least see ONE page, first one, from the right set. Let's deal with others
                    var CrawlerCurrentPage = this.Pages[BasePage];
                    for (var J = 1; J < (this.CacheForward + 1) * this.NColumns; J++) {
                        CrawlerCurrentPage = CrawlerCurrentPage.Next;
                        if (!CrawlerCurrentPage.Ready || CrawlerCurrentPage.PageN != RealStartPage + J) {
                            // Here it is - the page with the wrong content. We set up our re-render queue
                            FirstPageNToRender = RealStartPage + J;
                            FirstFrameToFill = CrawlerCurrentPage;
                            break;
                        }
                    }
                    break;
                }
            }

            this.CurStartPage = RealStartPage;
            if (WeeHaveFoundReadyPage && !FirstFrameToFill) {
                this.IdleOn();
                return;
            } else if (!WeeHaveFoundReadyPage) {
                FirstPageNToRender = RealStartPage;
                FirstFrameToFill = this.Pages[0];
                this.PutBlockIntoView(0);
            }
            this.CurStartPos = this.PagesPositionsCache.Get(Page).Range.From.slice(0);

            var CacheBroken = false;
            var NewInstr = new Array();
            var PageWeThinkAbout = FirstFrameToFill;
            for (var I = FirstPageNToRender; I < RealStartPage + (this.CacheForward + 1) * this.NColumns; I++) {
                if (this.PagesPositionsCache.LastPage() && this.PagesPositionsCache.LastPage() < I) {
                    if (I < RealStartPage + this.NColumns) {
                        PageWeThinkAbout.CleanPage();
                    } else {
                        break;
                    }
                } else {
                    if (!CacheBroken && this.PagesPositionsCache.Get(I)) {
                        NewInstr.push(PRIClone(this.PagesPositionsCache.Get(I)));
                    } else {
                        if (!CacheBroken) {
                            CacheBroken = true;
                            NewInstr.push({ Start: this.PagesPositionsCache.Get(I - 1).Range.To.slice(0) });
                        } else {
                            NewInstr.push({});
                        }
                        NewInstr[NewInstr.length - 1].CacheAs = I;
                    }
                }
                PageWeThinkAbout = FirstFrameToFill.Next;
            }
            FirstFrameToFill.SetPending(NewInstr);
            FirstFrameToFill.DrawInit(NewInstr);
        };

        Reader.prototype.PutBlockIntoView = function (Page) {
            this.CurVisiblePage = Page;
            for (var I = 0; I < this.Pages.length; I++) {
                if (I < Page || I >= Page + this.NColumns) {
                    this.Pages[I].Hide();
                } else {
                    this.Pages[I].Show();
                }
            }
        };

        Reader.prototype.GoToOpenPosition = function (NewPos) {
            clearTimeout(this.MoveTimeoutID);
            this.CurStartPos = NewPos.slice(0);

            var NewInstr = [{ Start: NewPos }];

            var ShouldWeCachePositions = NewPos.length == 1 && NewPos[0] == 0;
            if (ShouldWeCachePositions) {
                NewInstr[0].CacheAs = 0;
                this.CurStartPage = 0;
            } else {
                this.CurStartPage = undefined;
            }
            for (var I = 1; I < (this.CacheForward + 1) * this.NColumns; I++) {
                NewInstr.push({});
                if (ShouldWeCachePositions) {
                    NewInstr[I].CacheAs = I;
                }
            }
            this.PutBlockIntoView(0);
            for (var I = 1; I < this.Pages.length; I++) {
                this.Pages[I].Ready = false;
            }
            this.Pages[0].SetPending(NewInstr);
            this.Pages[0].DrawInit(NewInstr);
        };

        Reader.prototype.TOC = function () {
            return this.FB3DOM.TOC;
        };

        Reader.prototype.ResetCache = function () {
            this.IdleAction = 'load_page';
            this.IdleOff();
            this.PagesPositionsCache.Reset();
        };

        Reader.prototype.GetCachedPage = function (NewPos) {
            for (var I = 0; I < this.PagesPositionsCache.Length(); I++) {
                if (PosCompare(this.PagesPositionsCache.Get(I).Range.To, NewPos) > 0) {
                    return I;
                }
            }
            return undefined;
        };

        Reader.prototype.StoreCachedPage = function (Range) {
            this.PagesPositionsCache.Set(Range.CacheAs, PRIClone(Range));
            this.SaveCache();
        };

        Reader.prototype.SearchForText = function (Text) {
            return null;
        };

        Reader.prototype.PrepareCanvas = function () {
            this.ResetCache();
            var InnerHTML = '<div class="FB3ReaderColumnset' + this.NColumns + '" id="FB3ReaderHostDiv" style="width:100%; overflow:hidden; height:100%">';
            this.Pages = new Array();
            for (var I = 0; I < this.CacheBackward + this.CacheForward + 1; I++) {
                for (var J = 0; J < this.NColumns; J++) {
                    var NewPage = new FB3ReaderPage.ReaderPage(J, this.FB3DOM, this, this.Pages[this.Pages.length - 1]);
                    this.Pages[this.Pages.length] = NewPage;
                    InnerHTML += NewPage.GetInitHTML(I * this.NColumns + J + 1);
                }
            }
            this.Pages[this.Pages.length - 1].Next = this.Pages[0];

            this.BackgroundRenderFrame = new FB3ReaderPage.ReaderPage(0, this.FB3DOM, this, null);
            InnerHTML += this.BackgroundRenderFrame.GetInitHTML(0);

            InnerHTML += '</div>';
            this.Site.Canvas.innerHTML = InnerHTML;

            for (var I = 0; I < this.Pages.length; I++) {
                this.Pages[I].BindToHTMLDoc(this.Site);
            }

            this.BackgroundRenderFrame.BindToHTMLDoc(this.Site);
            this.BackgroundRenderFrame.PagesToRender = new Array(100);
            this.CanvasW = this.Site.Canvas.clientWidth;
            this.CanvasH = this.Site.Canvas.clientHeight;
            this.LoadCache();
        };

        Reader.prototype.AfterCanvasResize = function () {
            var _this = this;
            if (this.OnResizeTimeout) {
                clearTimeout(this.OnResizeTimeout);
            }
            this.OnResizeTimeout = setTimeout(function () {
                if (_this.CanvasW != _this.Site.Canvas.clientWidth || _this.CanvasH != _this.Site.Canvas.clientHeight) {
                    for (var I = 0; I < _this.Pages.length; I++) {
                        _this.Pages[I].Reset();
                    }
                    _this.PrepareCanvas();
                    _this.GoTO(_this.CurStartPos.slice(0));
                    _this.OnResizeTimeout = undefined;
                }
            }, 200);
        };

        Reader.prototype.FirstUncashedPage = function () {
            var FirstUncached;
            if (this.PagesPositionsCache.Length()) {
                FirstUncached = {
                    Start: this.PagesPositionsCache.Get(this.PagesPositionsCache.Length() - 1).Range.To.slice(0),
                    CacheAs: this.PagesPositionsCache.Length()
                };
            } else {
                FirstUncached = {
                    Start: [0],
                    CacheAs: 0
                };
            }
            return FirstUncached;
        };
        Reader.prototype.PageForward = function () {
            var _this = this;
            clearTimeout(this.MoveTimeoutID);
            if (this.CurStartPage !== undefined) {
                if (this.CurStartPage + this.NColumns < this.PagesPositionsCache.Length()) {
                    this.GoTOPage(this.CurStartPage + this.NColumns);
                } else if (this.PagesPositionsCache.LastPage() && this.PagesPositionsCache.LastPage() < this.CurStartPage + this.NColumns) {
                    return;
                } else {
                    this.MoveTimeoutID = setTimeout(function () {
                        _this.PageForward();
                    }, 50);
                }
            } else {
                // First wee seek forward NColimns times to see if the page wee want to show is rendered. If not - we will wait untill it is
                var PageToView = this.Pages[this.CurVisiblePage];
                for (var I = 0; I < this.NColumns; I++) {
                    PageToView = PageToView.Next;
                }
                if (!PageToView.Ready) {
                    if (PageToView.Pending) {
                        this.MoveTimeoutID = setTimeout(function () {
                            _this.PageForward();
                        }, 50);
                    } else if (this.Pages[this.CurVisiblePage + this.NColumns - 1].RenderInstr.Range.To[0] == -1) {
                        return;
                    } else {
                        this.GoToOpenPosition(this.Pages[this.CurVisiblePage + this.NColumns - 1].RenderInstr.Range.To);
                    }
                } else {
                    this.CurStartPos = PageToView.RenderInstr.Range.From;
                    this.PutBlockIntoView(PageToView.ID - 1);
                }
            }
            return;
        };
        Reader.prototype.PageBackward = function () {
            var _this = this;
            clearTimeout(this.MoveTimeoutID);
            if (this.CurStartPage !== undefined) {
                if (this.CurStartPage > 0) {
                    this.GoTOPage(this.CurStartPage - this.NColumns);
                }
            } else {
                // we will even have to get back to the ladder (and may be even wait until the ladder is ready, too bad)
                var GotoPage = this.GetCachedPage(this.CurStartPos);
                if (GotoPage != undefined) {
                    this.GoTOPage(GotoPage);
                } else {
                    if (this.EnableBackgroundPreRender) {
                        this.MoveTimeoutID = setTimeout(function () {
                            _this.PageBackward();
                        }, 50);
                    } else {
                        alert('Backward paging not implemented yet, sory');
                    }
                }
            }
        };

        Reader.prototype.GoToPercent = function (Percent) {
            var BlockN = Math.round(this.FB3DOM.TOC[this.FB3DOM.TOC.length - 1].e * Percent / 100);
            this.GoTO([BlockN]);
        };

        Reader.prototype.CurPosPercent = function () {
            if (!this.FB3DOM.TOC) {
                return undefined;
            }
            return 100 * this.CurStartPos[0] / this.FB3DOM.TOC[this.FB3DOM.TOC.length - 1].e;
        };

        Reader.prototype.ElementAtXY = function (X, Y) {
            var Node = this.Site.elementFromPoint(X, Y);

            if (!Node) {
                return undefined;
            }

            while (!Node.id && Node.parentElement) {
                Node = Node.parentElement;
            }

            if (!Node.id.match(/n(_\d+)+/)) {
                return undefined;
            }

            var Addr = Node.id.split('_');
            Addr.shift();
            Addr.shift();
            return Addr;
        };

        Reader.prototype.IdleGo = function (PageData) {
            var _this = this;
            if (this.IsIdle) {
                switch (this.IdleAction) {
                    case 'load_page':
                        var PageToPrerender = this.FirstUncashedPage();
                        if (this.FB3DOM.TOC[this.FB3DOM.TOC.length - 1].e <= PageToPrerender.Start[0]) {
                            //							alert('Cache done ' + this.PagesPositionsCache.length + ' items calced');
                            this.PagesPositionsCache.LastPage(this.PagesPositionsCache.Length() - 1);
                            this.IdleOff();
                            this.Site.IdleThreadProgressor.Progress(this, 100);
                            this.Site.IdleThreadProgressor.HourglassOff(this);
                            clearInterval(this.IdleTimeoutID);
                            this.SaveCache();
                            return;
                        } else {
                            this.PagesPositionsCache.LastPage(0);
                            this.SaveCache();
                            this.Site.IdleThreadProgressor.Progress(this, PageToPrerender.Start[0] / this.FB3DOM.TOC[this.FB3DOM.TOC.length - 1].e * 100);
                        }
                        this.IdleAction = 'wait';

                        // Kind of lightweight DrawInit here, it looks like copy-paste is reasonable here
                        this.BackgroundRenderFrame.RenderInstr = PageToPrerender;

                        for (var I = 0; I < 100; I++) {
                            this.BackgroundRenderFrame.PagesToRender[I] = { CacheAs: PageToPrerender.CacheAs + I + 1 };
                        }

                        var Range;
                        Range = this.BackgroundRenderFrame.DefaultRangeApply(PageToPrerender);

                        this.FB3DOM.GetHTMLAsync(this.HyphON, RangeClone(Range), this.BackgroundRenderFrame.ID + '_', this.BackgroundRenderFrame.ViewPortW, this.BackgroundRenderFrame.ViewPortH, function (PageData) {
                            _this.IdleAction = 'fill_page';
                            _this.IdleGo(PageData);
                        });
                        break;
                    case 'fill_page':
                        this.PagesPositionsCache.LastPage(0);
                        this.SaveCache();
                        if (PageData) {
                            this.BackgroundRenderFrame.DrawEnd(PageData);
                        }
                        this.IdleAction = 'load_page';
                        break;
                    default:
                }
            }
        };

        Reader.prototype.SaveCache = function () {
            this.PagesPositionsCache.Save(this.BackgroundRenderFrame.ViewPortW + ':' + this.CanvasW + ':' + this.CanvasH + ':' + this.Site.Key);
        };

        Reader.prototype.LoadCache = function () {
            this.PagesPositionsCache.Load(this.BackgroundRenderFrame.ViewPortW + ':' + this.CanvasW + ':' + this.CanvasH + ':' + this.Site.Key);
        };
        Reader.prototype.IdleOn = function () {
            var _this = this;
            if (!this.EnableBackgroundPreRender) {
                return;
            }
            clearInterval(this.IdleTimeoutID);
            this.IsIdle = true;
            this.Site.IdleThreadProgressor.HourglassOn(this);
            this.IdleGo();

            // Looks like small delay prevents garbage collector from doing it's job - so we let it breath a bit
            this.IdleTimeoutID = setInterval(function () {
                _this.IdleGo();
            }, 100);
        };

        Reader.prototype.IdleOff = function () {
            this.IsIdle = false;
        };
        return Reader;
    })();
    FB3Reader.Reader = Reader;
})(FB3Reader || (FB3Reader = {}));
//# sourceMappingURL=FB3Reader.js.map
