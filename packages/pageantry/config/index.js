import { join } from 'path'
import loadJSON from 'load-json-file'

const CONFIG_FILE_PATH = join(process.cwd(), '/config/config.json')

export const readConfigFile = () => loadJSON.sync(CONFIG_FILE_PATH)
export const getConfigFilePath = () => CONFIG_FILE_PATH

export const readLocalConfigFile = path => loadJSON.sync(join(process.cwd(), path))

