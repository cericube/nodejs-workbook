export interface User {
  id: number;
  name: string;
  age: number;
}

export const validateUserAge = (user: User): boolean => {
  if (user.age < 0) {
    throw new Error('Age cannot be negative');
  }
  return user.age >= 19;
};
