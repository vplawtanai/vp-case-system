# Document authorization display

Invoice and Receipt use one manual authorization block. The blank signing space
and capacity label are presentation, not proof of signature or a claim that a
signature is universally required by law. Neither renderer invents a signer,
uses the system Issue actor as a signatory, or loads a live signature image.
Quotation keeps its existing signer selection and rendering unchanged.

Receipt shows the received date from the selected snapshot's `payment.received_on`.
Issued/voided Receipt also shows the Bangkok calendar date of the frozen
`receipt.issued_at`, validated against the immutable lifecycle timestamp. Drafts
have no issue-date row. `receipt_date`, numbering and snapshots are not rewritten.
The contract freezes JSON evidence, not a byte-identical rendered PDF. Historical
documents gain a blank manual signing area and display already-frozen dates;
their financial, identity and lifecycle evidence remains unchanged.

## Automatic signature boundary

The existing `finance_authorized_signers` master contains name, position, email
and `signature_storage_path`. Quotation prefers frozen signer text when available
but can use live master/asset fallbacks. Assets are in private `vp-document-assets`
under `signers/<id>/...`. Upload uses a new path (`upsert: false`), but replacement
and removal delete the old object. This is not immutable historical evidence.

Invoice and Receipt have no dedicated frozen authorized-signatory contract.
Receipt's `issued_by_user_id`/`issued_by_name` records the Issue actor, not signing
authority. An upstream Quotation signer does not authorize a different document.
Migration 038 protects logo evidence, not these signature objects.

Automatic embedding is intentionally not implemented. The smallest prospective
extension would reuse the existing signer master, require explicit document
authorization, freeze signer name/capacity and immutable object/version evidence
at Issue, and retain/protect referenced signature bytes against replacement and
deletion. Existing issued documents should remain grandfathered with the manual
block and no retroactive signer attribution. At this audit the next unused
migration number is 039; none is created or applied here. Applied 037/038 remain
unchanged. Such an extension needs separate approval before implementation.

## Local checks

`scripts/tests/document-authorization.test.cjs` checks formal controls, both
Receipt dates, Bangkok day boundaries, Draft/VOID behavior, issuer non-attribution
and the unchanged Quotation image/blank fallback. Synthetic renderer/browser
fixtures use no Production connection or data writes.
