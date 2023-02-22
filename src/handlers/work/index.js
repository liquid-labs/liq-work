import { handlers as issueHandlers } from './issues'
import { handlers as projectHandlers } from './projects'

import * as startHandler from './start'
import * as statusHandlers from './status'
import * as submitHandler from './submit'

const handlers = [
  startHandler,
  statusHandlers,
  submitHandler,
  ...issueHandlers,
  ...projectHandlers
]

export { handlers }
