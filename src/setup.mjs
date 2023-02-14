import * as fsPath from 'node:path'

const setup = ({ app, model, reporter }) => {
  app.liq.constants.WORK_DB_PATH = fsPath.join(app.liq.home(), 'work', 'work-db.yaml')
}

export { setup }
