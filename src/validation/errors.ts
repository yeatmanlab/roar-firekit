// ***************************************************
// *********** Parameter Validation Functions ***********
// ***************************************************

export interface ValidationError {
  keyword: string;
  instancePath: string;
  message: string;
  params: { [key: string]: unknown };
  schema: string;
  data: unknown;
}

const displayAdditionalPropertiesError = (error: ValidationError) => {
  return `Error in parameter "${error.params.additionalProperty}": ${error.message}\nRemove this parameter from variant parameters.
  `;
};

const displayTypeError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message}\nExpected type: ${error.schema}\nReceived type: ${error.data}
  `;
};
const displayValueError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message}\nExpected value: ${error.params?.allowedValues}\nReceived value: ${error.data}
  `;
};

const displayRangeError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message}\nExpected range: ${error.params.limit}\nReceived value: ${error.data}
  `;
};

export const errorsMap: { [key: string]: (error: ValidationError) => string } = {
  additionalProperties: displayAdditionalPropertiesError,
  enum: displayValueError,
  maximum: displayRangeError,
  minimum: displayRangeError,
  type: displayTypeError,
};
