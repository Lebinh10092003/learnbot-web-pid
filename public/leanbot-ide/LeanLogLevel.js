export const LogLevel = Object.freeze({
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
});

export function parseLogLevel(levelString){
    return LogLevel[levelString.toUpperCase()]; // text => enum-like
}
