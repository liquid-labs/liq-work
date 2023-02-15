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
    name         : 'issues',
    required     : true,
    isMultivalue : true,
    description  : 'References to the issues associated to the work. May be an integer number when assoicated with the first project specified or have the form &lt;org&gt/&lt;project name&gt;-&lt;issue number&gt;.'
  },
  {
    name        : 'noAutoAssign',
    isBoolean   : true,
    description : "Suppresses the default behavior of assigning the issue based on the current user's GitHub authentication."
  }
]

export { commonAssignParameters }