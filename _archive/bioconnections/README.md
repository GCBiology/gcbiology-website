# BioConnections source archive

BioConnections was retired from the website on September 5, 2026 (UTC).
Its original code is preserved for future development.

- `game/index.html`: the complete, unchanged game frontend.
- `../../supabase/`: the existing answer checker, puzzle generator, and database migrations, kept in their original location.
- The website's active `../../game/index.html` sends old game URLs to the homepage.
- `../../_config.yml` excludes `_archive` and `supabase` from the GitHub Pages/Jekyll output. Keep these exclusions if reorganizing the source or changing deployment tools. A generic file server serving the repository directly does not apply Jekyll exclusions; serve the built output when testing publication boundaries.

The original frontend SHA-256 is
`67487d882c1dcdc462cdd6e0eac393be877dc6c555954af4c0241fd997dca8f9`.

The archived game retains the bugs documented during the retirement audit:
an unavailable backend hostname, selection changes during answer validation,
an undismissable results modal, inaccessible keyboard tile controls, and
duplicate-term acceptance in the backend checker. Review and fix those before
reactivating it. No Supabase project or database was deleted by this change.

To restore the game later, copy the archived frontend back over the public
redirect page, resolve the documented game issues, restore the navigation
link, and verify the live backend. Do not publish the archive itself.

Jekyll exclusion behavior: [official configuration documentation](https://jekyllrb.com/docs/configuration/options/#global-configuration).
