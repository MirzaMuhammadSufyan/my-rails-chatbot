// Emoji picker entries + WhatsApp-style text shortcuts (:name: or <3)
export const EMOJI_ENTRIES = [
  { e: "😀", s: [":grin:", ":smile:", ":D", ":happy:"] },
  { e: "😃", s: [":smiley:"] },
  { e: "😄", s: [":joy:", ":lol:"] },
  { e: "😁", s: [":beam:"] },
  { e: "😅", s: [":sweat_smile:", ":awkward:"] },
  { e: "😂", s: [":joy:", ":rofl:", ":laugh:"] },
  { e: "🤣", s: [":rofl:", ":rolling:"] },
  { e: "😊", s: [":blush:", ":shy:"] },
  { e: "😇", s: [":innocent:", ":angel:"] },
  { e: "🙂", s: [":slight_smile:"] },
  { e: "😉", s: [":wink:"] },
  { e: "😍", s: [":heart_eyes:", ":love_eyes:"] },
  { e: "🥰", s: [":love:", ":adore:"] },
  { e: "😘", s: [":kiss:", ":blow_kiss:"] },
  { e: "😋", s: [":yum:", ":tongue:"] },
  { e: "😎", s: [":cool:", ":sunglasses:"] },
  { e: "🤔", s: [":think:", ":hmm:"] },
  { e: "😐", s: [":neutral:", ":meh:"] },
  { e: "😑", s: [":expressionless:"] },
  { e: "😶", s: [":speechless:", ":mute:"] },
  { e: "🙄", s: [":roll_eyes:", ":eyeroll:"] },
  { e: "😏", s: [":smirk:"] },
  { e: "😣", s: [":persevere:"] },
  { e: "😥", s: [":sad_relieved:", ":disappointed:"] },
  { e: "😮", s: [":open_mouth:", ":wow:", ":surprised:"] },
  { e: "😯", s: [":hushed:"] },
  { e: "😲", s: [":astonished:", ":shocked:"] },
  { e: "😳", s: [":flushed:", ":embarrassed:"] },
  { e: "🥺", s: [":pleading:", ":puppy:"] },
  { e: "😢", s: [":cry:", ":sad:"] },
  { e: "😭", s: [":sob:", ":bawling:"] },
  { e: "😤", s: [":angry:", ":mad:", ":steam:"] },
  { e: "😠", s: [":angry_face:"] },
  { e: "🤬", s: [":swear:", ":furious:"] },
  { e: "😡", s: [":rage:", ":very_angry:"] },
  { e: "👍", s: [":thumbsup:", ":ok:", ":+1:", ":like:"] },
  { e: "👎", s: [":thumbsdown:", ":-1:", ":dislike:"] },
  { e: "👏", s: [":clap:", ":applause:"] },
  { e: "🙌", s: [":raised_hands:", ":praise:"] },
  { e: "🤝", s: [":handshake:", ":deal:"] },
  { e: "🙏", s: [":pray:", ":thanks:", ":please:"] },
  { e: "💪", s: [":muscle:", ":strong:"] },
  { e: "✌️", s: [":peace:", ":victory:"] },
  { e: "❤️", s: [":heart:", "<3", ":love:", ":red_heart:"] },
  { e: "🧡", s: [":orange_heart:"] },
  { e: "💛", s: [":yellow_heart:"] },
  { e: "💚", s: [":green_heart:"] },
  { e: "💙", s: [":blue_heart:"] },
  { e: "💜", s: [":purple_heart:"] },
  { e: "🖤", s: [":black_heart:"] },
  { e: "💔", s: [":broken_heart:", "</3"] },
  { e: "🔥", s: [":fire:", ":lit:", ":hot:"] },
  { e: "✨", s: [":sparkles:", ":shine:"] },
  { e: "🎉", s: [":party:", ":tada:", ":celebrate:"] },
  { e: "🎊", s: [":confetti:"] },
  { e: "💯", s: [":100:", ":hundred:"] },
  { e: "✅", s: [":check:", ":done:", ":tick:"] },
  { e: "❌", s: [":x:", ":cross:", ":no:"] },
  { e: "⭐", s: [":star:"] },
  { e: "🌟", s: [":glow_star:"] },
  { e: "💬", s: [":speech:", ":chat:", ":message:"] }
]

export const EMOJIS = EMOJI_ENTRIES.map((entry) => entry.e)

// Longest shortcuts first so :heart_eyes: matches before :heart:
export const EMOJI_SHORTCUTS_SORTED = EMOJI_ENTRIES.flatMap(({ e, s }) =>
  s.map((shortcut) => ({ shortcut, emoji: e }))
).sort((a, b) => b.shortcut.length - a.shortcut.length)

export function applyEmojiShortcutsToText(text) {
  let result = text
  for (const { shortcut, emoji } of EMOJI_SHORTCUTS_SORTED) {
    const escaped = shortcut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    result = result.replace(new RegExp(escaped, "gi"), emoji)
  }
  return result
}
