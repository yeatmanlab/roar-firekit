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
  return `Error in parameter "${error.params.additionalProperty}": ${error.message}
  Please remove this parameter from your variant parameters.
  `;
};

const displayTypeError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message} 
  Expected type: ${error.schema}, Received type: ${error.data}
  `;
};
const displayValueError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message} 
  Expected value: ${error.params?.allowedValues}, Received value: ${error.data}
  `;
};

const displayRangeError = (error: ValidationError) => {
  return `Error in parameter "${error.instancePath}": ${error.message} 
  Expected range: ${error.params.limit}, Received value: ${error.data}
  `;
};

export const errorsMap: { [key: string]: (error: ValidationError) => string } = {
  additionalProperties: displayAdditionalPropertiesError,
  enum: displayValueError,
  maximum: displayRangeError,
  minimum: displayRangeError,
  type: displayTypeError,
};