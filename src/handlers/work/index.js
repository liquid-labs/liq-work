import { handlers as issueHandlers } from './issues'
import { handlers as projectHandlers } from './projects'

import * as cleanHandler from './clean'
import * as cleanImpliedHandler from './clean-implied'
import * as startHandler from './start'
import * as statusHandlers from './status'
import * as submitHandler from './submit'

const handlers = [
  cleanHandler,
  cleanImpliedHandler,
  startHandler,
  statusHandlers,
  submitHandler,
  ...issueHandlers,
  ...projectHandlers
]

export { handlers }
