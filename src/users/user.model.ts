import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  @Prop({ required: true, unique: true })
  telegramId: string;

  @Prop({})
  firstName: string;

  @Prop()
  lastName?: string;

  @Prop({ unique: true, sparse: true })
  username?: string;

  @Prop()
  languageCode?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop({ default: false })
  isPremium: boolean;

  @Prop({ type: Date })
  lastSeenAt?: Date;

  @Prop({ type: Object })
  preferences?: {
    defaultStablecoin?: string;
    notifications?: boolean;
    autoConfirm?: boolean;
    language?: string;
  };

  @Prop([String])
  roles: string[]; // ['user', 'admin', 'vip']

  // Timestamps added automatically by mongoose
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes
UserSchema.index({ telegramId: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { sparse: true });
UserSchema.index({ isActive: 1 });
