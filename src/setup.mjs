import * as fsPath from 'node:path'

import { WorkDB } from './handlers/work/_lib/work-db'

const setup = ({ app, model, reporter }) => {
  app.liq.constants.WORK_DB_PATH = fsPath.join(app.liq.home(), 'work', 'work-db.yaml')

  app.liq.pathResolvers.workKey = {
    optionsFetcher: () => {
      const workDB = new WorkDB({ app })
      return workDB.getWorkKeys()
    },
    bitReString: 'work-[^/]+(?:/|%2[Ff])[^/]+(?:/|%2[Ff])[0-9]+'
  }
}

export { setup }
