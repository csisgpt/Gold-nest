import { ValidationError } from 'class-validator';
import { ApiFieldError } from '../http/api-response';

const arrayIndexRegex = /^\d+$/;

function joinPath(parent: string, property: string): string {
  if (!parent) {
    return property;
  }
  if (arrayIndexRegex.test(property)) {
    return `${parent}[${property}]`;
  }
  return `${parent}.${property}`;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiFieldError[] {
  return errors.flatMap((error) => {
    const currentPath = joinPath(parentPath, error.property);
    const constraintMessages = error.constraints
      ? Object.values(error.constraints).map((message) => ({
          path: currentPath,
          message,
        }))
      : [];

    const childMessages = error.children?.length
      ? flattenValidationErrors(error.children, currentPath)
      : [];

    return [...constraintMessages, ...childMessages];
  });
}
