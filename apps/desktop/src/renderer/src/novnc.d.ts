declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string }; shared?: boolean });
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    background: string;
    focusOnClick: boolean;
    disconnect(): void;
    focus(): void;
    clipboardPasteFrom(text: string): void;
  }
}
