import * as fsPath from 'node:path'

const setup = ({ app, model, reporter }) => {
  app.liq.constants.WORK_DB_PATH = app.liq.home() + ''
}

export { setup }
