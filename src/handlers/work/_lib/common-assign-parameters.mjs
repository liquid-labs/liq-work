import { commonIssuesParameters } from './common-issues-parameters'

const commonAssignParameters = () => [
  {
    name        : 'assignee',
    description : 'The assignee (github login ID) to add to the issues. See `noAutoAssign`.'
  },
  {
    name        : 'comemnt',
    description : "The comment to use when claiming an issue. Defaults to: 'Work for this issue has begun on branch &lt;workBranchName&gt;.'"
  },
  {
    name        : 'noAutoAssign',
    isBoolean   : true,
    description : "Suppresses the default behavior of assigning the issue based on the current user's GitHub authentication."
  },
  ...commonIssuesParameters
]

export { commonAssignParameters }