const commonIssuesParameters = () => [
  {
    name         : 'issues',
    required     : true,
    isMultivalue : true,
    description  : 'References to the issues associated to the work. May be an integer number when assoicated with the first project specified or have the form &lt;org&gt/&lt;project name&gt;-&lt;issue number&gt;.'
  }
]

export { commonIssuesParameters }
