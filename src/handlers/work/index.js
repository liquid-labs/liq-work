import { handlers as issueHandlers } from './issues'
import { handlers as projectHandlers } from './projects'

import * as buildHandler from './build'
import * as buildImpliedHandler from './build-implied'
import * as cleanHandler from './clean'
import * as cleanImpliedHandler from './clean-implied'
import * as pauseHandler from './pause'
import * as pauseImpliedHandler from './pause-implied'
import * as resumeHandler from './resume'
import * as saveHandler from './save'
import * as saveImpliedHandler from './save-implied'
import * as startHandler from './start'
import * as statusHandler from './status'
import * as statusImpliedHandler from './status-implied'
import * as submitHandler from './submit'
import * as submitImpliedHandler from './submit-implied'

const handlers = [
  buildHandler,
  buildImpliedHandler,
  cleanHandler,
  cleanImpliedHandler,
  pauseHandler,
  pauseImpliedHandler,
  resumeHandler,
  saveHandler,
  saveImpliedHandler,
  startHandler,
  statusHandler,
  statusImpliedHandler,
  submitHandler,
  submitImpliedHandler,
  ...issueHandlers,
  ...projectHandlers
]

export { handlers }
