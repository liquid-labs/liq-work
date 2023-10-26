import * as fsPath from 'node:path'

import { LIQ_HOME } from '@liquid-labs/liq-defaults'

import { WorkDB } from './handlers/work/_lib/work-db'

const setup = ({ app, reporter }) => {
  app.ext.constants.WORK_DB_PATH = fsPath.join(LIQ_HOME(), 'work', 'work-db.yaml')

  app.ext.pathResolvers.workKey = {
    optionsFetcher : () => {
      const workDB = new WorkDB({ app })
      return workDB.getWorkKeys()
    },
    bitReString : 'work-[^/]+(?:/|%2[Ff])[^/]+(?:/|%2[Ff])[0-9]+'
  }
}

export { setup }
