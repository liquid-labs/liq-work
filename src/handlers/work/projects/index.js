import * as addHandler from './add'
import * as addImpliedHandler from './add-implied'
import * as listHandler from './list'
import * as listImpliedHandler from './list-implied'
import * as removeHandler from './remove'

const handlers = [addHandler, addImpliedHandler, listHandler, listImpliedHandler, removeHandler]

export { handlers }
