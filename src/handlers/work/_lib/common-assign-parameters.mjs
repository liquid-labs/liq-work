// import * as fsPath from 'node:path'

// import { CredentialsDB, purposes } from '@liquid-labs/liq-credentials-db'
// import { Octocache } from '@liquid-labs/octocache'

import { commonIssuesParameters } from './common-issues-parameters'

const commonAssignParameters = () => {
  const parameters = [
    {
      name        : 'assignee',
      description : 'The assignee (github login ID) to add to the issues. See `noAutoAssign`.'
    },
    {
      name        : 'comment',
      description : "The comment to use when claiming an issue. Defaults to: 'Work for this issue has begun on branch &lt;work branch name&gt;.'"
    },
    {
      name        : 'noAutoAssign',
      isBoolean   : true,
      description : "Suppresses the default behavior of assigning the issue based on the current user's GitHub authentication."
    },
    ...commonIssuesParameters()
  ]
  /*
  const issuesParam = commonIssuesParameters.find((p) => p.name === 'issues')

  issuesParam.optionsFunc = async ({ localProjectName, model, orgKey, req }) => {
    if (orgKey === undefined) {
      const cwd = req.get('X-CWD')
      const pkgPath = fsPath.join(cwd, 'package.json')

    }

    const credDB = new CredentialsDB({ app, cache })
    const authToken = credDB.getToken(purposes.GITHUB_API)

    // TODO: I think it makes sense to create a octocache instance on app so we share and it can cache
    const octocache = new Octocache({ authToken })

    octocache.paginate()
  } */

  return parameters
}

export { commonAssignParameters }
