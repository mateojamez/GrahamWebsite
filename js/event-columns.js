/** Maps a WEDDING.events[].slug to the matching boolean column on guests, e.g. "ring-ceremony" -> "invited_ring_ceremony". */
export function invitedColumn(slug) {
  return `invited_${String(slug).replace(/-/g, "_")}`;
}
