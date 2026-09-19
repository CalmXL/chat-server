import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'username cannot be empty' })
  @Length(3, 32, { message: 'username must be between 3 and 32 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain letters, numbers, and underscores',
  })
  username: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email cannot be empty' })
  @MaxLength(255, { message: 'email cannot exceed 255 characters' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'password cannot be empty' })
  @Length(8, 64, { message: 'password must be between 8 and 64 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain both letters and numbers',
  })
  password: string;

  @IsString()
  @IsOptional()
  @MaxLength(64, { message: 'nickname cannot exceed 64 characters' })
  nickname?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512, { message: 'avatar cannot exceed 512 characters' })
  avatar?: string;
}
