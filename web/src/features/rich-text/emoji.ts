// Q9: a curated set of common emoji, stored as the character itself.
const LIST = `grinning 😀|smiley 😃|smile 😄|grin 😁|laughing 😆|sweat_smile 😅|rofl 🤣|joy 😂
|slightly_smiling_face 🙂|upside_down_face 🙃|wink 😉|blush 😊|innocent 😇|heart_eyes 😍
|star_struck 🤩|kissing_heart 😘|yum 😋|stuck_out_tongue 😛|zany_face 🤪|hugs 🤗|thinking 🤔
|neutral_face 😐|smirk 😏|unamused 😒|roll_eyes 🙄|grimacing 😬|relieved 😌|pensive 😔|sleeping 😴
|mask 😷|nauseated_face 🤢|exploding_head 🤯|partying_face 🥳|sunglasses 😎|nerd_face 🤓
|confused 😕|worried 😟|slightly_frowning_face 🙁|open_mouth 😮|flushed 😳|pleading_face 🥺|cry 😢
|sob 😭|scream 😱|disappointed 😞|sweat 😓|weary 😩|triumph 😤|rage 😡|angry 😠|skull 💀|poop 💩
|ghost 👻|robot 🤖|see_no_evil 🙈|wave 👋|raised_hand ✋|ok_hand 👌|v ✌️|crossed_fingers 🤞|metal 🤘
|point_left 👈|point_right 👉|point_up 👆|point_down 👇|+1 👍|thumbsup 👍|-1 👎|thumbsdown 👎|fist ✊
|facepunch 👊|clap 👏|raised_hands 🙌|handshake 🤝|pray 🙏|muscle 💪|eyes 👀|brain 🧠
|technologist 🧑‍💻|shrug 🤷|facepalm 🤦|bow 🙇|raising_hand 🙋|heart ❤️|orange_heart 🧡
|yellow_heart 💛|green_heart 💚|blue_heart 💙|purple_heart 💜|black_heart 🖤|broken_heart 💔
|sparkling_heart 💖|two_hearts 💕|100 💯|anger 💢|boom 💥|dizzy 💫|dash 💨|zzz 💤|speech_balloon 💬
|thought_balloon 💭|white_check_mark ✅|heavy_check_mark ✔️|x ❌|heavy_plus_sign ➕
|heavy_minus_sign ➖|question ❓|exclamation ❗|bangbang ‼️|warning ⚠️|no_entry ⛔
|no_entry_sign 🚫|stop_sign 🛑|red_circle 🔴|orange_circle 🟠|yellow_circle 🟡|green_circle 🟢
|blue_circle 🔵|purple_circle 🟣|black_circle ⚫|white_circle ⚪|arrow_right ➡️|arrow_left ⬅️
|arrow_up ⬆️|arrow_down ⬇️|arrows_counterclockwise 🔄|repeat 🔁|new 🆕|up 🆙|cool 🆒|ok 🆗|sos 🆘
|information_source ℹ️|recycle ♻️|fire 🔥|sparkles ✨|star ⭐|star2 🌟|zap ⚡|rocket 🚀|tada 🎉
|balloon 🎈|gift 🎁|trophy 🏆|1st_place_medal 🥇|dart 🎯|bulb 💡|memo 📝|pencil2 ✏️|pushpin 📌
|round_pushpin 📍|paperclip 📎|link 🔗|lock 🔒|unlock 🔓|key 🔑|hammer 🔨|wrench 🔧|gear ⚙️
|toolbox 🧰|hammer_and_wrench 🛠️|bug 🐛|test_tube 🧪|mag 🔍|chart_with_upwards_trend 📈
|chart_with_downwards_trend 📉|bar_chart 📊|clipboard 📋|calendar 📅|hourglass ⌛
|hourglass_flowing_sand ⏳|alarm_clock ⏰|package 📦|email 📧|envelope ✉️|bell 🔔|mega 📣|book 📖
|books 📚|bookmark 🔖|label 🏷️|file_folder 📁|page_facing_up 📄|computer 💻|keyboard ⌨️|iphone 📱
|moneybag 💰|dollar 💵|gem 💎|construction 🚧|rotating_light 🚨|checkered_flag 🏁
|triangular_flag_on_post 🚩|art 🎨|camera 📷|headphones 🎧|microphone 🎤|jigsaw 🧩|coffee ☕|tea 🍵
|beer 🍺|pizza 🍕|hamburger 🍔|taco 🌮|cake 🍰|birthday 🎂|cookie 🍪|apple 🍎|avocado 🥑|sunny ☀️
|cloud ☁️|umbrella ☔|snowflake ❄️|rainbow 🌈|ocean 🌊|earth_americas 🌎|crescent_moon 🌙
|seedling 🌱|evergreen_tree 🌲|cactus 🌵|four_leaf_clover 🍀|sunflower 🌻|rose 🌹|cherry_blossom 🌸
|dog 🐶|cat 🐱|fox_face 🦊|bear 🐻|panda_face 🐼|tiger 🐯|lion 🦁|frog 🐸|penguin 🐧|owl 🦉|unicorn 🦄
|bee 🐝|butterfly 🦋|turtle 🐢|snake 🐍|octopus 🐙|whale 🐳|shark 🦈|car 🚗|bike 🚲|airplane ✈️
|house 🏠|mountain ⛰️`

export const EMOJI = LIST.split('|').map((entry): [string, string] => {
  const [name, char] = entry.trim().split(' ')
  return [name, char]
})

const BY_NAME = new Map(EMOJI)

export const emojiNamed = (name: string) => BY_NAME.get(name)

/** Names that start with `prefix`, or have a word after `_` that does. */
export const emojiStartingWith = (prefix: string) =>
  EMOJI.filter(
    ([name]) => name.startsWith(prefix) || name.includes(`_${prefix}`)
  )
