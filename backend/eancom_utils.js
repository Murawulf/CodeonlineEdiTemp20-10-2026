// Utility functions for escaping and unescaping EANCOM reserved characters
// In EANCOM (EDIFACT), the default release character is '?'
// It is used to escape syntax characters: ' (segment terminator), + (segment separator), : (component separator), and ? (release character itself)

function escapeEancom(str) {
  if (!str) return str;
  return str.replace(/[?+:'"]/g, match => '?' + match);
}

function unescapeEancom(str) {
  if (!str) return str;
  return str.replace(/\?([?+:'"])/g, '$1');
}

module.exports = {
  escapeEancom,
  unescapeEancom
};
