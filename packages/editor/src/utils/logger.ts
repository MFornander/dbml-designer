// Adapted from holistics/dbml dbml-playground (src/utils/logger.ts), Apache-2.0. See NOTICE.
function wrap (logger: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    logger(...args);
  };
}

export const logger = {
  log: wrap(console.log),
  error: wrap(console.error),
  warn: wrap(console.warn),
  info: wrap(console.info),
  debug: wrap(console.debug),
};

export default logger;
