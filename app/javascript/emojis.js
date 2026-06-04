// Emoji picker entries + WhatsApp-style text shortcuts (:name: or <3)
export const EMOJI_ENTRIES = [
  { e: "😀", s: [":grin:", ":smile:", ":D", ":happy:", ":s:"] },
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
  { e: "💬", s: [":speech:", ":chat:", ":message:"] },
  { e: "😛", s: [":stuck_out_tongue:", ":silly:"] },
  { e: "😜", s: [":wink_tongue:", ":crazy:"] },
  { e: "🤗", s: [":hug:", ":hugs:"] },
  { e: "🤩", s: [":star_struck:", ":wow_face:"] },
  { e: "😴", s: [":sleep:", ":sleepy:", ":zzz:"] },
  { e: "🤤", s: [":drool:", ":hungry_face:"] },
  { e: "🥱", s: [":yawn:"] },
  { e: "😬", s: [":grimace:", ":awkward_face:"] },
  { e: "🤐", s: [":zipper_mouth:", ":secret:"] },
  { e: "🤫", s: [":shush:", ":quiet:"] },
  { e: "🤭", s: [":giggle:", ":oops:"] },
  { e: "🫠", s: [":melt:", ":melting:"] },
  { e: "🫡", s: [":salute:"] },
  { e: "🫶", s: [":heart_hands:"] },
  { e: "👋", s: [":wave:", ":hi:", ":hello:"] },
  { e: "🤞", s: [":fingers_crossed:", ":luck:"] },
  { e: "🤟", s: [":love_you:", ":ily:"] },
  { e: "🤘", s: [":rock:", ":metal:"] },
  { e: "👌", s: [":ok_hand:", ":perfect:"] },
  { e: "🤌", s: [":pinch:", ":italian:"] },
  { e: "👊", s: [":punch:", ":fist_bump:"] },
  { e: "✊", s: [":fist:", ":power:"] },
  { e: "🫵", s: [":point:", ":you:"] },
  { e: "👀", s: [":eyes:", ":look:"] },
  { e: "🧠", s: [":brain:", ":smart:"] },
  { e: "💀", s: [":skull:", ":dead:", ":rip:"] },
  { e: "👻", s: [":ghost:", ":boo:"] },
  { e: "🤖", s: [":robot:", ":bot:"] },
  { e: "🐶", s: [":dog:", ":puppy:"] },
  { e: "🐱", s: [":cat:", ":kitty:"] },
  { e: "🐭", s: [":mouse:"] },
  { e: "🐹", s: [":hamster:"] },
  { e: "🐰", s: [":rabbit:", ":bunny:"] },
  { e: "🦊", s: [":fox:"] },
  { e: "🐻", s: [":bear:"] },
  { e: "🐼", s: [":panda:"] },
  { e: "🐨", s: [":koala:"] },
  { e: "🐯", s: [":tiger:"] },
  { e: "🦁", s: [":lion:"] },
  { e: "🐮", s: [":cow:"] },
  { e: "🐷", s: [":pig:"] },
  { e: "🐸", s: [":frog:"] },
  { e: "🐵", s: [":monkey:"] },
  { e: "🙈", s: [":see_no_evil:"] },
  { e: "🙉", s: [":hear_no_evil:"] },
  { e: "🙊", s: [":speak_no_evil:"] },
  { e: "🐔", s: [":chicken:"] },
  { e: "🐧", s: [":penguin:"] },
  { e: "🐦", s: [":bird:"] },
  { e: "🦋", s: [":butterfly:"] },
  { e: "🐝", s: [":bee:", ":busy:"] },
  { e: "🌸", s: [":blossom:", ":flower:"] },
  { e: "🌹", s: [":rose:"] },
  { e: "🌻", s: [":sunflower:"] },
  { e: "🌴", s: [":palm:", ":vacation:"] },
  { e: "🌈", s: [":rainbow:"] },
  { e: "☀️", s: [":sun:", ":sunny:"] },
  { e: "🌙", s: [":moon:", ":night:"] },
  { e: "⭐", s: [":star2:"] },
  { e: "☁️", s: [":cloud:"] },
  { e: "⛈️", s: [":storm:"] },
  { e: "❄️", s: [":snow:", ":cold:"] },
  { e: "🍎", s: [":apple:", ":red_apple:"] },
  { e: "🍌", s: [":banana:"] },
  { e: "🍕", s: [":pizza:"] },
  { e: "🍔", s: [":burger:"] },
  { e: "🍟", s: [":fries:"] },
  { e: "🌮", s: [":taco:"] },
  { e: "🍩", s: [":donut:"] },
  { e: "🍰", s: [":cake:", ":birthday:"] },
  { e: "🍫", s: [":chocolate:"] },
  { e: "☕", s: [":coffee:"] },
  { e: "🍺", s: [":beer:"] },
  { e: "🍷", s: [":wine:"] },
  { e: "🥤", s: [":soda:", ":drink:"] },
  { e: "⚽", s: [":soccer:", ":football:"] },
  { e: "🏀", s: [":basketball:"] },
  { e: "🏈", s: [":american_football:"] },
  { e: "🎾", s: [":tennis:"] },
  { e: "🏆", s: [":trophy:", ":win:"] },
  { e: "🎮", s: [":game:", ":gaming:"] },
  { e: "🎵", s: [":music:", ":note:"] },
  { e: "🎬", s: [":movie:", ":film:"] },
  { e: "📷", s: [":camera:", ":photo:"] },
  { e: "💻", s: [":laptop:", ":computer:"] },
  { e: "📱", s: [":phone:", ":mobile:"] },
  { e: "🔔", s: [":bell:", ":notification:"] },
  { e: "📌", s: [":pin:", ":pushpin:"] },
  { e: "📎", s: [":paperclip:", ":attach:"] },
  { e: "✏️", s: [":pencil:", ":write:"] },
  { e: "📚", s: [":books:", ":study:"] },
  { e: "💡", s: [":bulb:", ":idea:"] },
  { e: "🔒", s: [":lock:", ":secure:"] },
  { e: "🔓", s: [":unlock:"] },
  { e: "🚀", s: [":rocket:", ":launch:"] },
  { e: "✈️", s: [":plane:", ":travel:"] },
  { e: "🚗", s: [":car:", ":drive:"] },
  { e: "🚲", s: [":bike:", ":cycle:"] },
  { e: "🏠", s: [":house:", ":home:"] },
  { e: "💼", s: [":briefcase:", ":work:"] },
  { e: "💰", s: [":money:", ":cash:"] },
  { e: "💸", s: [":money_fly:", ":spent:"] },
  { e: "🎁", s: [":gift:", ":present:"] },
  { e: "🎂", s: [":birthday_cake:"] },
  { e: "🎈", s: [":balloon:"] },
  { e: "🇵🇰", s: [":pk:", ":pakistan:"] },
  { e: "🇺🇸", s: [":us:", ":usa:"] },
  { e: "🇬🇧", s: [":uk:", ":gb:"] },
  { e: "🇮🇳", s: [":india:", ":in:"] },
  { e: "🇦🇪", s: [":uae:", ":ae:"] },
  { e: "🇨🇦", s: [":canada:", ":ca:"] },
  { e: "🤷", s: [":shrug:", ":idk:"] },
  { e: "🤦", s: [":facepalm:", ":smh:"] },
  { e: "💁", s: [":info:", ":sassy:"] },
  { e: "🙅", s: [":no_gesture:", ":nope:"] },
  { e: "🙆", s: [":yes_gesture:", ":yep:"] },
  { e: "🫤", s: [":diagonal_mouth:", ":unsure:"] },
  { e: "😮‍💨", s: [":exhale:", ":sigh:"] },
  { e: "❤️‍🔥", s: [":heart_on_fire:"] },
  { e: "💕", s: [":two_hearts:"] },
  { e: "💖", s: [":sparkling_heart:"] },
  { e: "💗", s: [":growing_heart:"] },
  { e: "💋", s: [":kiss_mark:", ":lips:"] },
  { e: "🌶️", s: [":spicy:", ":hot_pepper:"] },
  { e: "🆗", s: [":ok_box:", ":okay:"] },
  { e: "🆕", s: [":new:"] },
  { e: "🔝", s: [":top:", ":up:"] },
  { e: "⚠️", s: [":warning:", ":alert:"] },
  { e: "🛑", s: [":stop:"] },
  { e: "♻️", s: [":recycle:"] },
  { e: "∞", s: [":infinity:"] },
  { e: "™️", s: [":tm:"] },
  { e: "©️", s: [":copyright:"] }
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

function shortcutMatchKey(shortcut) {
  if (shortcut.startsWith(":")) return shortcut.slice(1).replace(/:$/, "").toLowerCase()
  return shortcut.toLowerCase()
}

export function getEmojiShortcutMatches(query, type = "colon") {
  if (!query) return []

  if (type === "lt") {
    const needle = query.toLowerCase()
    const seen = new Set()
    const results = []

    for (const { shortcut, emoji } of EMOJI_SHORTCUTS_SORTED) {
      if (!shortcut.startsWith("<")) continue
      if (!shortcut.toLowerCase().startsWith(needle)) continue

      const id = `${emoji}-${shortcut}`
      if (seen.has(id)) continue
      seen.add(id)
      results.push({ shortcut, emoji })
      if (results.length >= 10) break
    }

    return results
  }

  const q = query.toLowerCase()
  const seen = new Set()
  const results = []

  for (const { shortcut, emoji } of EMOJI_SHORTCUTS_SORTED) {
    const key = shortcutMatchKey(shortcut)
    const colonForm = shortcut.startsWith(":") ? shortcut.toLowerCase() : `:${key}:`

    if (!key.startsWith(q) && !colonForm.startsWith(`:${q}`)) continue

    const id = `${emoji}-${shortcut}`
    if (seen.has(id)) continue
    seen.add(id)
    results.push({ shortcut, emoji })
    if (results.length >= 10) break
  }

  return results
}
