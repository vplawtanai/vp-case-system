// Display-only plain text for notes. Render the result as a React text child,
// never as HTML; source notes and link destinations are not executed or changed.
export function cleanNoteText(source:string):string {
 return source
  .replace(/\r\n?/g,'\n')
  .replace(/^[ \t]{0,3}(?:`{3,}|~{3,}).*$/gm,'')
  .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?$/gm,'$1')
  .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$|^[ \t]*={2,}[ \t]*$/gm,'')
  .replace(/^[ \t]*(?:>[ \t]*)+/gm,'')
  .replace(/^[ \t]*[-+*][ \t]+\[([ xX])\][ \t]+/gm,(_,done:string)=>done===' '?'☐ ':'☑ ')
  .replace(/^[ \t]*[-+*][ \t]+/gm,'• ')
  .replace(/!\[([^\]\n]*)\]\([^\n)]*\)/g,'$1')
  .replace(/\[([^\]\n]+)\]\(([^\n)]*)\)/g,'$1 ($2)')
  .replace(/(`+)([^`\n]+)\1/g,'$2')
  .replace(/(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g,'$2')
  .replace(/~~(\S(?:[\s\S]*?\S)?)~~/g,'$1')
  .replace(/(^|[^*\\])\*(\S(?:[^*\n]*?\S)?)\*(?!\*)/g,'$1$2')
  .replace(/(^|[^\p{L}\p{M}\p{N}_\\])_(\S(?:[^_\n]*?\S)?)_(?![\p{L}\p{M}\p{N}_])/gu,'$1$2')
  .replace(/\\([\\`*_[\]{}()#+.!>\-])/g,'$1')
  .replace(/\n{3,}/g,'\n\n')
  .trim();
}
