import * as fsPath from 'node:path'

import { LIQ_PLAYGROUND } from '@liquid-labs/liq-defaults'

const determinePathHelper = ({ app, projectFQN }) => {
  const [org, project] = projectFQN.split('/')
  const projectPath = fsPath.join(LIQ_PLAYGROUND(), org, project)

  return { org, project, projectPath }
}

export { determinePathHelper }
