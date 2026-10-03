// Certificate actions: copy link, share, zip (M4 slice 4.13 owns this file). Spread into copy in src/ui/copy.ts.
// Remix, Build your own and "Make this for <target> instead" reuse copy.buttons.remix, copy.buttons.buildYourOwn,
// copy.makeFor and copy.targetNames, and the share title reuses copy.certificate.title.
// Plain wording for Brian to confirm (QUESTIONS U5).

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

  // Small strings the certificate page adds around its blocks (fix slice F3b). Kept apart from
  // `actions`, whose key set the actions tests pin.
  certificateUi: {
    // The line beside the Copy link at the top of the page. The page keeps nothing on reload (W7).
    leavingNote: 'Leaving to paste? Copy the link first so you can come back.',
    // The heading over the summary lines.
    summaryHeading: 'Before you copy',
    // A copy button's accessible name. It names its block; the visible text stays "Copy".
    copyBlock: (title: string) => `Copy ${title}`,
    // A long block shows its first lines, with this button to show the rest. The label stays the
    // same open or closed: aria-expanded carries the state and the chevron shows it.
    showFullText: 'Show full text',
  },
};
