// Certificate actions: copy link, share, zip (M4 slice 4.13 owns this file). Spread into copy in src/ui/copy.ts.
// Remix and "Make this for <target> instead" reuse copy.buttons.remix, copy.makeFor and copy.targetNames,
// and the share title reuses copy.certificate.title. Plain wording for Brian to confirm (QUESTIONS U5).

export const actionsCopy = {
  actions: {
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    // The link is not shown on the page, so there is nothing to select by hand.
    linkFailed: "Couldn't copy the link",
    share: 'Share',
    shareFailed: "Couldn't open sharing. Try Copy link instead.",
    downloadZip: 'Download zip',
  },
};
