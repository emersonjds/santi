// Q9: a curated set of common emoji, stored as the character itself.
const LIST = `grinning 😀|smiley 😃|smile 😄|grin 😁|laughing 😆|sweat_smile 😅|rofl 🤣|joy 😂
|slightly_smiling_face 🙂|upside_down_face 🙃|wink 😉|blush 😊|innocent 😇|heart_eyes 😍
|star_struck 🤩|kissing_heart 😘|yum 😋|stuck_out_tongue 😛|zany_face 🤪|money_mouth_face 🤑
|hugs 🤗|hand_over_mouth 🤭|shushing_face 🤫|thinking 🤔|zipper_mouth_face 🤐|raised_eyebrow 🤨
|neutral_face 😐|expressionless 😑|no_mouth 😶|smirk 😏|unamused 😒|roll_eyes 🙄|grimacing 😬
|relieved 😌|pensive 😔|sleepy 😪|sleeping 😴|mask 😷|face_with_thermometer 🤒|nauseated_face 🤢
|sneezing_face 🤧|hot_face 🥵|cold_face 🥶|woozy_face 🥴|dizzy_face 😵|exploding_head 🤯
|cowboy_hat_face 🤠|partying_face 🥳|sunglasses 😎|nerd_face 🤓|monocle_face 🧐|confused 😕
|worried 😟|slightly_frowning_face 🙁|open_mouth 😮|hushed 😯|astonished 😲|flushed 😳
|pleading_face 🥺|fearful 😨|cold_sweat 😰|cry 😢|sob 😭|scream 😱|confounded 😖|persevere 😣
|disappointed 😞|sweat 😓|weary 😩|tired_face 😫|yawning_face 🥱|triumph 😤|rage 😡|angry 😠
|cursing_face 🤬|smiling_imp 😈|skull 💀|poop 💩|clown_face 🤡|ghost 👻|alien 👽|robot 🤖
|see_no_evil 🙈|hear_no_evil 🙉|speak_no_evil 🙊|wave 👋|raised_hand ✋|ok_hand 👌|v ✌️
|crossed_fingers 🤞|love_you_gesture 🤟|metal 🤘|call_me_hand 🤙|point_left 👈|point_right 👉
|point_up 👆|point_down 👇|+1 👍|thumbsup 👍|-1 👎|thumbsdown 👎|fist ✊|facepunch 👊|clap 👏
|raised_hands 🙌|open_hands 👐|handshake 🤝|pray 🙏|writing_hand ✍️|muscle 💪|eyes 👀|brain 🧠
|technologist 🧑‍💻|shrug 🤷|facepalm 🤦|bow 🙇|raising_hand 🙋|ninja 🥷|superhero 🦸
|detective 🕵️|construction_worker 👷|mage 🧙|runner 🏃|dancer 💃|heart ❤️|orange_heart 🧡
|yellow_heart 💛|green_heart 💚|blue_heart 💙|purple_heart 💜|black_heart 🖤|broken_heart 💔
|sparkling_heart 💖|two_hearts 💕|100 💯|anger 💢|boom 💥|dizzy 💫|dash 💨|zzz 💤
|speech_balloon 💬|thought_balloon 💭|white_check_mark ✅|heavy_check_mark ✔️|x ❌
|heavy_plus_sign ➕|heavy_minus_sign ➖|question ❓|exclamation ❗|bangbang ‼️|warning ⚠️
|no_entry ⛔|no_entry_sign 🚫|stop_sign 🛑|red_circle 🔴|orange_circle 🟠|yellow_circle 🟡
|green_circle 🟢|blue_circle 🔵|purple_circle 🟣|black_circle ⚫|white_circle ⚪|arrow_right ➡️
|arrow_left ⬅️|arrow_up ⬆️|arrow_down ⬇️|arrows_counterclockwise 🔄|repeat 🔁|new 🆕|up 🆙
|cool 🆒|ok 🆗|sos 🆘|information_source ℹ️|recycle ♻️|fire 🔥|sparkles ✨|star ⭐|star2 🌟
|zap ⚡|rocket 🚀|tada 🎉|confetti_ball 🎊|balloon 🎈|gift 🎁|trophy 🏆|1st_place_medal 🥇
|2nd_place_medal 🥈|3rd_place_medal 🥉|medal 🏅|dart 🎯|bulb 💡|memo 📝|pencil2 ✏️|pushpin 📌
|round_pushpin 📍|paperclip 📎|link 🔗|lock 🔒|unlock 🔓|key 🔑|hammer 🔨|wrench 🔧|gear ⚙️
|toolbox 🧰|nut_and_bolt 🔩|hammer_and_wrench 🛠️|bug 🐛|test_tube 🧪|microscope 🔬|mag 🔍
|chart_with_upwards_trend 📈|chart_with_downwards_trend 📉|bar_chart 📊|clipboard 📋
|calendar 📅|spiral_calendar 🗓️|hourglass ⌛|hourglass_flowing_sand ⏳|alarm_clock ⏰
|stopwatch ⏱️|package 📦|inbox_tray 📥|outbox_tray 📤|email 📧|envelope ✉️|bell 🔔|no_bell 🔕
|loudspeaker 📢|mega 📣|book 📖|books 📚|bookmark 🔖|label 🏷️|file_folder 📁
|open_file_folder 📂|page_facing_up 📄|scroll 📜|computer 💻|desktop_computer 🖥️|keyboard ⌨️
|iphone 📱|floppy_disk 💾|battery 🔋|electric_plug 🔌|moneybag 💰|dollar 💵|credit_card 💳
|gem 💎|construction 🚧|rotating_light 🚨|checkered_flag 🏁|triangular_flag_on_post 🚩
|crystal_ball 🔮|magic_wand 🪄|art 🎨|camera 📷|movie_camera 🎥|headphones 🎧|microphone 🎤
|video_game 🎮|jigsaw 🧩|coffee ☕|tea 🍵|beer 🍺|beers 🍻|champagne 🍾|pizza 🍕|hamburger 🍔
|taco 🌮|cake 🍰|birthday 🎂|cookie 🍪|doughnut 🍩|popcorn 🍿|apple 🍎|avocado 🥑
|hot_pepper 🌶️|sunny ☀️|cloud ☁️|umbrella ☔|snowflake ❄️|rainbow 🌈|ocean 🌊
|earth_americas 🌎|globe_with_meridians 🌐|crescent_moon 🌙|seedling 🌱|evergreen_tree 🌲
|cactus 🌵|four_leaf_clover 🍀|fallen_leaf 🍂|sunflower 🌻|rose 🌹|cherry_blossom 🌸|dog 🐶
|cat 🐱|fox_face 🦊|bear 🐻|panda_face 🐼|tiger 🐯|lion 🦁|frog 🐸|monkey_face 🐵|penguin 🐧
|owl 🦉|unicorn 🦄|bee 🐝|butterfly 🦋|snail 🐌|turtle 🐢|snake 🐍|octopus 🐙|crab 🦀
|whale 🐳|shark 🦈|sloth 🦥|t-rex 🦖|car 🚗|bike 🚲|airplane ✈️|ship 🚢|house 🏠|office 🏢
|tent ⛺|mountain ⛰️|volcano 🌋|world_map 🗺️`

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
