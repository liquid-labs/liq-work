import createError from 'http-errors'

import { extractParameters } from '@liquid-labs/condition-eval'

const prepareQuestionsFromControls = ({ title, key, controlSetMap }) => {
  console.log(controlSetMap) // DEBUG

  const controlSetBurndownList = Object.keys(controlSetMap)
  const controlSetsProcessed = []
  const questionBundle = {
    title,
    key,
    questions      : [],
    mappings       : [],
    varsReferenced : []
  }

  for (let questionBundleSubSet = processNextControlSet({ controlSetMap, controlSetBurndownList, controlSetsProcessed });
    questionBundleSubSet !== null;
    questionBundleSubSet = processNextControlSet({ controlSetMap, controlSetBurndownList, controlSetsProcessed })) {
    console.log('questionBundleSubSet:', questionBundleSubSet) // DEBUG
    questionBundle.questions.push(...questionBundleSubSet.questions)
    questionBundle.mappings.push(...questionBundleSubSet.mappings)
    questionBundle.varsReferenced.push(...questionBundleSubSet.varsReferenced)
  }

  // filter out duplicate vars
  questionBundle.varsReferenced = questionBundle.varsReferenced.filter((v, i, arr) => i === arr.indexOf(v))

  return questionBundle
}

const processNextControlSet = ({ controlSetMap, controlSetBurndownList, controlSetsProcessed }) => {
  for (const ctrlSetName of controlSetBurndownList) {
    const { controls, depends } = controlSetMap[ctrlSetName]
    if (depends === undefined || controlSetsProcessed.includes(ctrlSetName)) {
      const questionBundle = processControls({ controls })
      controlSetBurndownList.splice(controlSetBurndownList.indexOf(ctrlSetName), 1)
      controlSetsProcessed.push(ctrlSetName)
      return questionBundle
    }
  }
  // because we return within the for-loop, we should only fall out when we're completely done

  if (controlSetBurndownList.length === 0) { return null }
  else {
    throw createError.BadRequest(`There are unmet dependencies in control sets: ${controlSetBurndownList.join(', ')}`)
  }
}

const processControls = ({ controls }) => {
  const allQuestions = []
  const allMappings = []
  for (const { questions, mappings } of controls) {
    if (questions !== undefined) { allQuestions.push(...questions) }
    if (mappings !== undefined) { allMappings.push(...mappings) }
  }

  return {
    questions      : allQuestions,
    mappings       : allMappings,
    varsReferenced : extractAllParameters({ mappings : allMappings, questions : allQuestions })
  }
}

const extractAllParameters = ({ mappings, questions }) => {
  const allVars = []
  for (const { parameter, condition, elseSource, mappings } of questions) {
    allVars.push(parameter)
    if (condition !== undefined) { allVars.push(...extractParameters({ expression : condition })) }
    if (elseSource !== undefined) { allVars.push(...extractParameters({ expression : elseSource })) }
    allVars.push(...extractMappingParamters(mappings)) // this is the for-local mappings (from question)
  }

  allVars.push(...extractMappingParamters(mappings)) // this is the function-local (global) mappings

  return allVars
}

const extractMappingParamters = (mappings = []) => {
  const allVars = []
  for (const { condition, maps } of mappings) {
    if (condition !== undefined) { allVars.push(...extractParameters({ expression : condition })) }

    for (const { parameter, source } of maps) {
      allVars.push(parameter)
      if (source !== undefined) { allVars.push(...extractParameters({ expression : source })) }
    }
  }

  return allVars
}

export { prepareQuestionsFromControls }
