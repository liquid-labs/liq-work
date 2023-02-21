import { handlers as issueHandlers } from './issues'
import { handlers as projectHandlers } from './projects'

import * as startHandler from './start'
import * as submitHandler from './submit'

const handlers = [
  startHandler,
  submitHandler,
  ...issueHandlers,
  ...projectHandlers
]

export { handlers }
