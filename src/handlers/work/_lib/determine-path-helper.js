import * as fsPath from 'node:path'

const determinePathHelper = ({ app, projectFQN }) => {
  const [org, project] = projectFQN.split('/')
  const projectPath = fsPath.join(app.liq.playground(), org, project)

  return { org, project, projectPath }
}

export { determinePathHelper }
