export function Log(storageKey?: string) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);

      const handleResult = (data: any) => {
        const req = (this as any).request;

        if (req) {
          req.scope = req.scope || {};
          req.scope[storageKey || propertyKey] = data;
        }

        return data;
      };

      return result instanceof Promise
        ? result.then(handleResult)
        : handleResult(result);
    };

    return descriptor;
  };
}
