import { handlers as issueHandlers } from './issues'
import { handlers as projectHandlers } from './projects'

import * as cleanHandler from './clean'
import * as cleanImpliedHandler from './clean-implied'
import * as startHandler from './start'
import * as statusHandlers from './status'
import * as submitHandler from './submit'
import * as submitImpliedHandler from './submit-implied'

const handlers = [
  cleanHandler,
  cleanImpliedHandler,
  startHandler,
  statusHandlers,
  submitHandler,
  submitImpliedHandler,
  ...issueHandlers,
  ...projectHandlers
]

export { handlers }
