import { load } from 'js-yaml';
import decomment from 'decomment';
import { readFileSync, statSync } from 'fs';
import { dirname, join, extname } from 'path';
import caller from 'caller';

/**
 * Convenience wrapper for synchronously reading file contents.
 * @param {string} filePath The filename to read.
 * @returns {string} The file contents, with the BOM removed.
 * @private
 */
function readFile(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/^\ufeff/u, '');
}

interface ConfigData {
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  };
  rootDoc: string[];
}

/**
 * Loads a YAML configuration from a file.
 * @param {string} filePath The filename to load.
 * @returns {ConfigData} The configuration object from the file.
 * @throws {Error} If the file cannot be read.
 * @private
 */
function loadYAMLConfigFile(filePath: string): ConfigData | undefined {
  // lazy load YAML to improve performance when not used
  try {
    // empty YAML file can be null, so always use
    return (load(readFile(filePath)) as ConfigData) || {};
  } catch (e: unknown) {
    if (e instanceof Error) {
      e.message = `Cannot read config file: ${filePath}\nError: ${e.message}`;
      throw e;
    }
  }
}

/**
 * Loads a JSON configuration from a file.
 * @param {string} filePath The filename to load.
 * @returns {ConfigData} The configuration object from the file.
 * @throws {Error} If the file cannot be read.
 * @private
 */
function loadJSONConfigFile(filePath: string): ConfigData | undefined {
  try {
    return JSON.parse(decomment(readFile(filePath)));
  } catch (e: unknown) {
    if (e instanceof Error) {
      e.message = `Cannot read config file: ${filePath}\nError: ${e.message}`;
      throw e;
    }
  }
}

/**
 * Loads a configuration file regardless of the source. Inspects the file path
 * to determine the correctly way to load the config file.
 * @param {string} filePath The path to the configuration.
 * @returns {ConfigData|null} The configuration information.
 * @private
 */
function loadConfigFile(filePath: string): ConfigData | undefined {
  switch (extname(filePath)) {
    case '.json':
      return loadJSONConfigFile(filePath);

    case '.yaml':
    case '.yml':
      return loadYAMLConfigFile(filePath);

    default:
      throw new Error(
        `Unknown config file type: ${filePath}. The config file must have a .json, .yml, or .yaml extension.`,
      );
  }
}

// const find = (...args: string[]): string => {
//   const rel = join(...args);
//   return findStartingWith(__dirname, rel);
// };

const findStartingWith = (start: string, rel: string): string => {
  const file = join(start, rel);
  try {
    statSync(file);
    return file;
  } catch (err) {
    // They are equal for root dir
    if (dirname(start) !== start) {
      return findStartingWith(dirname(start), rel);
    }
    return '';
  }
};

// Find the rc file path
export const readConfig = (basename = 'roarconfig.json'): ConfigData | undefined => {
  const start = dirname(caller() || '.');
  const configPath: string = findStartingWith(start, basename);
  return loadConfigFile(configPath);
};
