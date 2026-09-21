// comingSoonProviders.js - providers that are registered but not implemented.
//
// They appear in the picker so the roadmap is visible, and they refuse clearly
// rather than pretending to connect. Each carries the specific reason it is
// not done, so the note is a real answer rather than a placeholder.
(function () {
  "use strict";

  const { ComingSoonProvider } = globalThis.EspProviderBase;

  const PENDING = [
    {
      id: "mailgun",
      label: "Mailgun",
      note: "Mailgun's API is built around transactional events rather than campaigns, so matching needs a different strategy to the other providers.",
    },
    {
      id: "ses",
      label: "Amazon SES",
      note: "SES requires AWS SigV4 request signing. This project has no build step or bundler, so signing would have to be hand-written before it can be supported.",
    },
  ];

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};

  PENDING.forEach((entry) => {
    globalThis.EspProviderRegistry[entry.id] = new ComingSoonProvider(entry);
  });
})();
