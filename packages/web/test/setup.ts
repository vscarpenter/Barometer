// jsdom ships HTMLDialogElement but leaves show()/showModal()/close() unimplemented
// (they are `undefined`). Polyfill them minimally so dialog lifecycle — open,
// close, the `close` event, backdrop dismissal — is exercisable under test. Real
// browsers provide these natively; this only fills the jsdom gap.
const proto = window.HTMLDialogElement.prototype;
if (typeof proto.showModal !== "function") {
  proto.show = function (this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };
  proto.showModal = function (this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement, returnValue?: string): void {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
