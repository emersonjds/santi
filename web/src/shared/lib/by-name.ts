/** One of `choices`, fixed per name; changing the hash or the list order reassigns every name. */
export const pickByName = <Choice>(
  name: string,
  choices: readonly Choice[]
) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return choices[hash % choices.length]
}
