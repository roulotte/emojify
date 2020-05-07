/* Utility methods */
const escapeRegexp = text => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

const unicodeToUnified = unicode =>
    String.fromCodePoint(...unicode.split("-").map(hex => parseInt(hex, 16)));

const unifiedToUnicode = unified => {
    const codepoints = [];
    for(const char of unified) {
        codepoints.push(char.codePointAt(0).toString(16))
    }
    return codepoints.join("-");
}

/* Main data objects */
const BY_NAMES = EMOJI_BY_NAMES;
const BY_UNICODE = EMOJI_BY_UNICODE;
const ASCII_LIST = EMOJI_ASCII;
export const MASK_BY_PROVIDER = PROVIDERS_MASKS;
const SKIN_TONE_MODIFIERS = { "1-2": "1f3fb", "3": "1f3fc", "4": "1f3fd", "5": "1f3fe" , "6": "1f3ff"};

export const REGEXP_COLONS = new RegExp("\:([a-zA-Z0-9-_+]+)\:(\:skin-tone-((?:1\-2|[3-6]))\:)?", "g");

const SURROGATES = Object.keys(BY_UNICODE)
    .map(unicode => unicodeToUnified(unicode))
    .map(unified => unified.replace('*', '\\*'))
    .sort((a, b) => b.length - a.length);

export const REGEXP_SURROGATES = new RegExp(`(?:${SURROGATES.join("|")})`, "g");

const ASCII_LIST_ESCAPED = {};
const SMILEYS = Object.keys(ASCII_LIST)
    .map(emoticon => {
        const escaped = emoticon.replace(/\&/g, '&amp;').replace(/\</g, '&lt;').replace(/\>/g, '&gt;');
        if (!ASCII_LIST_ESCAPED[escaped]) {
            ASCII_LIST_ESCAPED[escaped] = ASCII_LIST[emoticon];
        }
        return escaped;
    })
    .map(emoticon => escapeRegexp(emoticon));
export const REGEXP_ASCII = new RegExp(`(^|\\s)(${SMILEYS.join("|")})(?=$|[\\s|\\?\\.,!])`, "g");

const reverseMap = (map, mapValue = v => v, mapKey = k => k) =>
    Object.keys(map)
        .reduce((acc, key) => {
            const newKey = mapValue(map[key]);
            acc[newKey] = (acc[newKey] || []).concat(mapKey(key));
            return acc;
        }, {});
const SHORT_TO_ASCII = reverseMap(ASCII_LIST);


/* Public API */
export const ALL = BY_NAMES;
export const UNICODE = BY_UNICODE;
export const ASCII = ASCII_LIST;
export const SKIN_TONE_INDEX = { "1-2": 0, 3: 1, 4: 2, 5: 3, 6: 4 };

/**
 * Convert all unicode empjis (such as 🚽) to their shortNames equivalent (:toilet:)
 * @param String some text
 * @return String converted text
 */
export const unicodeToShortName = function(text) {
    return text.replace(REGEXP_SURROGATES, match => {
        return `:${BY_UNICODE[unifiedToUnicode(match)]}:` || match
    });
}

/**
 * Convert all shortName emojis (such as :rocket:) to their unicode equivalent (🚀)
 * @param String some text
 * @return String converted text
 */
export const shortNameToUnicode = function(text) {
    return text.replace(REGEXP_COLONS, (match, name, skinTone, toneLevel) => {
        let emoji = BY_NAMES[name];
        if (skinTone) {
            toneLevel = parseInt(toneLevel, 10);
            emoji = BY_NAMES[name].skin_variations[toneLevel - 2];
            return emoji ? unicodeToUnified(emoji) : match;
        }
        if (!emoji) {
            return match;
        }
        return unicodeToUnified(emoji.unicode[1] || emoji.unicode[0]);
    });
}


/**
 * Standardiztion of all unicode emojis.
 * We first transform all of them to shortNames, and then convert them back
 * to unicode.
 * @param String some text
 * @return String normalized text
 */
export const unifyUnicode = function(text) {
    text = unicodeToShortName(text);
    text = shortNameToUnicode(text);
    return text;
}

/**
 * Convert shortName emojis (such as :wink:) to their ascii equivalent ( ;^) )
 * Could be used on system that don't support unicode
 * @param String some text
 * @return String converted text
 */
export const shortNameToAscii = function(text) {
    return text.replace(REGEXP_COLONS,
        (match, name, skinTone, toneLevel) => (
            (SHORT_TO_ASCII[name] && SHORT_TO_ASCII[name][0])
            || `:${name}:`
        ));
}

/**
 * Convert ascii emoticons to their emoji shortnames equivalent
 * @param String some text
 * @return String converted text
 */
export const asciiToShortName = function(text) {
    const withParens = [];
    let start = 0;
    let replacement = text.replace(REGEXP_ASCII, (match, before, emoticon, offset) => {
        const emoji = ASCII_LIST_ESCAPED[emoticon];
        if (!emoji) {
            return match;
        }
        const openParen = emoticon.includes("(");
        const closeParen = emoticon.includes(")");

        if ((openParen || closeParen) && !withParens.includes(emoticon)) {
            withParens.push(emoticon);
        }

        // Let's check eventual meaningful parentethis, such as in "Let's meet tonight (around 7 - 8)"
        if(closeParen && !openParen) {
            const extract = text.substring(start, offset);
            start = offset + match.length;
            if (extract.includes("(") && !extract.includes(")")) {
                return match;
            }
        }

        return before + `:${emoji}:`;
    });

    // Here we must handle emoticons that were detected inside parentethis
    if (withParens.length) {
        const PARENS_REGEXP = new RegExp(`(\\(.+)(${withParens.map(escapeRegexp).join("|")})(.+\\))`, "g");
        replacement =
            replacement.replace(PARENS_REGEXP,
                (match, before, emoticon, after) => {
                    console.log(match, before, emoticon, after);
                    const emoji = BY_UNICODE[ASCII_LIST[emoticon]];
                    if (!emoji) {
                        return match;
                    }
                    return  before + emoji + after;
                });
    }

    return replacement;
}


/**
 * Return a boolean value depending if text contains or not some emojis
 * @param String some text
 * @return Boolean
 */
export const containsEmoji = function(text) {
    return REGEXP_COLONS.test(text) || REGEXP_SURROGATES.test(text);
}

/**
 * Extract all emoji related information.
 * It will detect 3 kind of emojis/emoticons:
 * - Unified emojis: native emojis 🚽,👌,🦄
 * - Shortnames emojis: :poop:, :fries:, :zap:
 * - Ascii emoticons: :'), >=), X-P
 * @param String some text
 * @return Object structural information regarding detected emojis
 */
export const extractEmoji = function(text) {
    let emojis = {};

    // Shortnames
    text.replace(REGEXP_COLONS, (match, name, skinTone, toneLevel, index) => {
        const emoji = BY_NAMES[name];
        if (emoji) {
            emojis[name] = {
                unicode: emoji.unicode[0],
                indices: [ index, index + match.length ]
            }
            if (skinTone) {
                emojis[name].skin_variation = {
                    shortname: skinTone.replace(/:/g, ""),
                    unicode: [emoji.unicode[0], SKIN_TONE_MODIFIERS[toneLevel]].join("-")
                }
            }
        }
    });

    // Unified unicode char
    text.replace(REGEXP_SURROGATES, (match, index) => {
        let shortName = BY_UNICODE[unifiedToUnicode(match)];
        let skinVariation = false;
        shortName = `:${shortName}:`.replace(REGEXP_COLONS, (match, name, skinTone, toneLevel) => {
            if (skinTone) {
                skinVariation = {
                    shortname: skinTone.replace(/:/g, ""),
                    unicode: SKIN_TONE_MODIFIERS[toneLevel]
                };
            }
            return name;
        })

        const emoji = BY_NAMES[shortName];
        if (emoji) {
            emojis[shortName] = {
                unicode:  emoji.unicode[0],
                indices: [index, index + match.length]
            }

            if (skinVariation) {
                emojis[shortName].skin_variation = {
                    shortname: skinVariation.shortname,
                    unicode: [emoji.unicode[0], skinVariation.unicode].join("-")
                };
            }
        }
    });

    return Object.keys(emojis).length > 0 ? emojis : null;
}